% function values = apply_perlin(samples, 

tic;

gradients = perlin_gradients( 10, 3, 4 );

samples = [0.02, 0.11, 0.52]';
num_samples = 100;

samples = repmat( samples, 1, num_samples );

noise = perlin_noise( samples, gradients );

toc;

%%  1d

tic;

num_dims = 1;
num_octaves = 3;
num_gradient_points = 15;

gradients = perlin_gradients( num_gradient_points, num_dims, num_octaves );

%%

tic;

image_size = 1e3;
image_mat = zeros( 1, image_size );
incr = 0.0005;

for i = 1:image_size
  image_mat(i) = perlin_noise( i * incr, gradients, 0.5 );
end

toc;

hold off;
plot( image_mat );
hold on;
shared_utils.plot.add_horizontal_lines( gca, 0 );
ylim( [-0.5, 0.5] );

%%

tic;

num_dims = 3;
num_octaves = 5;
num_gradient_points = 2;

gradients = perlin_gradients( num_gradient_points, num_dims, num_octaves );
toc;

%%

tic;

image_size = 64;
num_frames = 120;
incr = 0.001;

image_mat = perlin3d( gradients, image_size, num_frames, incr );

toc;

%%

% image_mat2 = [ [image_mat; flipud(image_mat)], [fliplr(image_mat); rot90(image_mat, 2)] ];

perlin_draw3d( image_mat, 1/60, true );

